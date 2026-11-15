import { Hono } from 'hono';
import { z } from 'zod';

import { allow, hashPassword, USER_COLUMNS, type Env } from '../auth.ts';
import { ACTIVITY_SELECT, body, idParam, log, query, toActivity, type ActivityRow, type Ctx } from '../context.ts';
import { first } from '../db.ts';
import { notFound, Problem } from '../errors.ts';
import { ROLES, type TeamMember, type User } from '../types.ts';

const COLORS = ['#4f46e5', '#0891b2', '#db2777', '#ea580c', '#16a34a', '#7c3aed', '#ca8a04', '#dc2626'];

const createInput = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(80),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email.')),
  role: z.enum(ROLES),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
});
const patchInput = z.object({ name: z.string().trim().min(2).max(80), role: z.enum(ROLES), active: z.boolean() }).partial();

/** The team list (owners and dispatchers) and account management (owners). */
export function teamRoutes({ db, now, org }: Ctx, opts: { hashRounds?: number } = {}) {
  async function members(id?: number): Promise<TeamMember[]> {
    return db.query<TeamMember>(
      `select ${USER_COLUMNS.split(', ')
        .map((c) => `u.${c}`)
        .join(', ')},
              count(j.id) filter (where j.scheduled_at >= w.start and j.scheduled_at < w.start + interval '7 days' and j.status <> 'cancelled')::int as "jobsThisWeek",
              coalesce(sum(j.duration_minutes) filter (where j.scheduled_at >= w.start and j.scheduled_at < w.start + interval '7 days' and j.status <> 'cancelled'), 0)::int as "minutesThisWeek",
              count(j.id) filter (where j.status = 'done' and j.completed_at >= w.month)::int as "completedThisMonth"
       from users u
       cross join (select date_trunc('week', $1::timestamptz at time zone $2) at time zone $2 as start,
                          date_trunc('month', $1::timestamptz at time zone $2) at time zone $2 as month) w
       left join jobs j on j.technician_id = u.id
       ${id ? 'where u.id = $3' : ''}
       group by u.id, w.start, w.month
       order by array_position(array['owner', 'dispatcher', 'technician'], u.role), u.name`,
      id ? [now(), org.timezone, id] : [now(), org.timezone],
    );
  }

  return new Hono<Env>()
    .get('/', allow('owner', 'dispatcher'), async (c) => c.json(await members()))

    .post('/', allow('owner'), body(createInput), async (c) => {
      const input = c.req.valid('json');
      if (await first(db, 'select 1 from users where email = $1', [input.email]))
        throw new Problem(409, 'email_taken', 'Some fields need attention.', { email: 'Someone on the team already uses this email.' });
      const count = (await first<{ n: number }>(db, 'select count(*)::int as n from users'))!.n;
      const row = (await first<{ id: number }>(
        db,
        'insert into users (name, email, role, password_hash, color) values ($1, $2, $3, $4, $5) returning id',
        [input.name, input.email, input.role, await hashPassword(input.password, opts.hashRounds), COLORS[count % COLORS.length]],
      ))!;
      await log(db, now(), c.get('user').id, input.name, `added ${input.name} to the team as ${input.role}`);
      return c.json((await members(row.id))[0], 201);
    })

    .patch('/:id', allow('owner'), body(patchInput), async (c) => {
      const id = idParam(c, 'Team member');
      const input = c.req.valid('json');
      const me = c.get('user');
      const target = await first<User>(db, `select ${USER_COLUMNS} from users where id = $1`, [id]);
      if (!target) throw notFound('Team member');
      if (id === me.id && input.role && input.role !== me.role) throw new Problem(409, 'self', 'You can’t change your own role.');
      if (id === me.id && input.active === false) throw new Problem(409, 'self', 'You can’t deactivate your own account.');
      await db.query('update users set name = $1, role = $2, active = $3 where id = $4', [
        input.name ?? target.name,
        input.role ?? target.role,
        input.active ?? target.active,
        id,
      ]);
      if (input.role && input.role !== target.role)
        await log(db, now(), me.id, target.name, `changed ${target.name}’s role to ${input.role}`);
      if (input.active !== undefined && input.active !== target.active)
        await log(db, now(), me.id, target.name, `${input.active ? 'reactivated' : 'deactivated'} ${target.name}`);
      return c.json((await members(id))[0]);
    });
}

const activityQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).optional().default(50) });

/** The activity feed: everything for the office, your own jobs for technicians. */
export function activityRoutes({ db }: Ctx) {
  return new Hono<Env>().get('/', query(activityQuery), async (c) => {
    const user = c.get('user');
    const { limit } = c.req.valid('query');
    const tech = user.role === 'technician';
    const rows = await db.query<ActivityRow>(
      `${ACTIVITY_SELECT} ${tech ? 'join jobs j on j.id = a.job_id where j.technician_id = $2' : ''} order by a.created_at desc, a.id desc limit $1`,
      tech ? [limit, user.id] : [limit],
    );
    return c.json(rows.map(toActivity));
  });
}

// Shapes the API sends. The web app imports these types, so both sides stay in step.

export type Role = 'owner' | 'dispatcher' | 'technician';
export type JobStatus = 'new' | 'scheduled' | 'in_progress' | 'done' | 'cancelled';
export type Priority = 'low' | 'normal' | 'urgent';
export type InvoiceStatus = 'draft' | 'sent' | 'overdue' | 'paid' | 'void';

export const ROLES: Role[] = ['owner', 'dispatcher', 'technician'];
export const JOB_STATUSES: JobStatus[] = ['new', 'scheduled', 'in_progress', 'done', 'cancelled'];
export const PRIORITIES: Priority[] = ['low', 'normal', 'urgent'];

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  color: string;
  active: boolean;
}

export interface Org {
  name: string;
  timezone: string;
  currency: string;
  taxBps: number;
}

export interface Session {
  token: string;
  user: User;
  org: Org;
}

export interface Person {
  id: number;
  name: string;
  color: string;
}

export interface JobSummary {
  id: number;
  number: string;
  title: string;
  status: JobStatus;
  priority: Priority;
  scheduledAt: string | null;
  durationMinutes: number;
  estimateCents: number;
  customer: { id: number; name: string; address: string; city: string };
  technician: Person | null;
  invoice: { id: number; number: string; status: InvoiceStatus } | null;
}

export interface Activity {
  id: number;
  subject: string;
  message: string;
  createdAt: string;
  user: Person | null;
  jobId: number | null;
}

export interface JobDetail extends JobSummary {
  description: string;
  createdAt: string;
  completedAt: string | null;
  customer: Customer;
  activity: Activity[];
}

export interface Customer {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string;
  city: string;
  notes: string;
  createdAt: string;
}

export interface CustomerRow extends Customer {
  jobs: number;
  openJobs: number;
  balanceCents: number;
  lastJobAt: string | null;
}

export interface CustomerDetail extends CustomerRow {
  recentJobs: JobSummary[];
  invoices: InvoiceRow[];
}

export interface InvoiceRow {
  id: number;
  number: string;
  status: InvoiceStatus;
  customer: { id: number; name: string };
  jobNumber: string | null;
  totalCents: number;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitCents: number;
}

export interface InvoiceDetail extends InvoiceRow {
  jobId: number | null;
  taxBps: number;
  subtotalCents: number;
  taxCents: number;
  lines: InvoiceLine[];
  customer: Customer;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface InvoiceList extends Page<InvoiceRow> {
  totals: Record<'draft' | 'sent' | 'overdue' | 'paid', { count: number; cents: number }>;
}

export interface TeamMember extends User {
  jobsThisWeek: number;
  minutesThisWeek: number;
  completedThisMonth: number;
}

export interface Kpi {
  label: string;
  value: number;
  kind: 'money' | 'count' | 'percent';
  hint: string;
  tone?: 'good' | 'bad';
}

export interface Dashboard {
  kpis: Kpi[];
  revenue: { month: string; invoicedCents: number; paidCents: number }[] | null;
  statusCounts: Record<JobStatus, number>;
  workload: (Person & { minutes: number; jobs: number })[];
  today: JobSummary[];
  activity: Activity[];
}

export interface ApiError {
  error: { code: string; message: string; fields?: Record<string, string> };
}

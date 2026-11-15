import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  Activity,
  CustomerDetail,
  CustomerRow,
  Dashboard,
  InvoiceDetail,
  InvoiceLine,
  InvoiceList,
  JobDetail,
  JobSummary,
  Page,
  Role,
  TeamMember,
} from '../../../server/types.ts';
import { api } from './api.ts';

// One place for every request the screens make, so caching and refreshing after changes stay consistent.

export const useDashboard = () => useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('GET', '/dashboard') });

export interface JobFilters {
  status?: string;
  technicianId?: number;
  from?: string;
  to?: string;
  search?: string;
}

const qs = (params: object) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== null) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const useJobs = (filters: JobFilters) =>
  useQuery({
    queryKey: ['jobs', filters],
    queryFn: () => api<JobSummary[]>('GET', `/jobs${qs(filters)}`),
    placeholderData: keepPreviousData,
  });

export const useJob = (id: number | null) =>
  useQuery({ queryKey: ['job', id], queryFn: () => api<JobDetail>('GET', `/jobs/${id}`), enabled: id !== null });

export const useCustomers = (params: { search: string; page: number; pageSize?: number }) =>
  useQuery({
    queryKey: ['customers', params],
    queryFn: () => api<Page<CustomerRow>>('GET', `/customers${qs(params)}`),
    placeholderData: keepPreviousData,
  });

export const useCustomer = (id: number | null) =>
  useQuery({ queryKey: ['customer', id], queryFn: () => api<CustomerDetail>('GET', `/customers/${id}`), enabled: id !== null });

export const useInvoices = (params: { status: string; search: string; page: number }) =>
  useQuery({
    queryKey: ['invoices', params],
    queryFn: () => api<InvoiceList>('GET', `/invoices${qs(params)}`),
    placeholderData: keepPreviousData,
  });

export const useInvoice = (id: number | null) =>
  useQuery({ queryKey: ['invoice', id], queryFn: () => api<InvoiceDetail>('GET', `/invoices/${id}`), enabled: id !== null });

export const useTeam = (enabled = true) => useQuery({ queryKey: ['team'], queryFn: () => api<TeamMember[]>('GET', '/users'), enabled });

export const useActivity = () => useQuery({ queryKey: ['activity'], queryFn: () => api<Activity[]>('GET', '/activity?limit=30') });

/** After any change, refresh what it can affect. Cheap, because everything is small. */
function useRefresh() {
  const client = useQueryClient();
  return () => client.invalidateQueries();
}

export interface JobInput {
  customerId?: number;
  title?: string;
  description?: string;
  priority?: string;
  technicianId?: number | null;
  scheduledAt?: string | null;
  durationMinutes?: number;
  estimateCents?: number;
  status?: string;
}

export function useSaveJob() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, ...input }: JobInput & { id?: number }) =>
      id ? api<JobDetail>('PATCH', `/jobs/${id}`, input) : api<JobDetail>('POST', '/jobs', input),
    onSuccess: refresh,
  });
}

export function useDeleteJob() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (id: number) => api<void>('DELETE', `/jobs/${id}`), onSuccess: refresh });
}

export interface CustomerInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  address?: string;
  city?: string;
  notes?: string;
}

export function useSaveCustomer() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, ...input }: CustomerInput & { id?: number }) =>
      id ? api<CustomerDetail>('PATCH', `/customers/${id}`, input) : api<CustomerDetail>('POST', '/customers', input),
    onSuccess: refresh,
  });
}

export function useInvoiceActions() {
  const refresh = useRefresh();
  const useAction = <A>(fn: (a: A) => Promise<InvoiceDetail>) => useMutation({ mutationFn: fn, onSuccess: refresh });
  return {
    create: useAction((input: { jobId?: number; customerId?: number; lines?: InvoiceLine[] }) =>
      api<InvoiceDetail>('POST', '/invoices', input),
    ),
    update: useAction(({ id, ...input }: { id: number; lines?: InvoiceLine[]; taxBps?: number }) =>
      api<InvoiceDetail>('PATCH', `/invoices/${id}`, input),
    ),
    send: useAction(({ id, dueInDays }: { id: number; dueInDays?: number }) =>
      api<InvoiceDetail>('POST', `/invoices/${id}/send`, { dueInDays }),
    ),
    pay: useAction((id: number) => api<InvoiceDetail>('POST', `/invoices/${id}/pay`)),
    void: useAction((id: number) => api<InvoiceDetail>('POST', `/invoices/${id}/void`)),
  };
}

export function useSaveMember() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, ...input }: { id?: number; name?: string; email?: string; role?: Role; password?: string; active?: boolean }) =>
      id ? api<TeamMember>('PATCH', `/users/${id}`, input) : api<TeamMember>('POST', '/users', input),
    onSuccess: refresh,
  });
}

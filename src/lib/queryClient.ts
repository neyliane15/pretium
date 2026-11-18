import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => {
        const code = (err as { code?: string } | null)?.code;
        if (code === '42501' || code === 'PGRST116' || code === 'P0001') return false;
        return count < 2;
      },
    },
    mutations: { retry: false },
  },
});

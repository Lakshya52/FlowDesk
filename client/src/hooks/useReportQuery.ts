import { useQuery, keepPreviousData } from "@tanstack/react-query";
import api from "../lib/api";

/**
 * Shared data-fetching hook for all report components.
 * - react-query based: caching, retries, no race conditions on filter changes
 * - `enabled` gates the query; pass false to skip fetching
 * - opts.keepPreviousData keeps the previous page/filter result visible while
 *   the next one loads (no skeleton flash on search/pagination)
 */
export const useReportQuery = <T = any>(
    endpoint: string,
    filters: Record<string, unknown>,
    enabled = true,
    opts: { keepPreviousData?: boolean } = {}
) => {
    return useQuery<T>({
        queryKey: ["report", endpoint, filters],
        queryFn: async () => {
            const { data } = await api.get(endpoint, { params: filters });
            return data?.data as T;
        },
        enabled,
        staleTime: 60 * 1000,
        retry: 1,
        ...(opts.keepPreviousData ? { placeholderData: keepPreviousData } : {}),
    });
};

export default useReportQuery;

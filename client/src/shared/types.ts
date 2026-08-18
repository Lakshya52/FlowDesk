export interface ApiError {
  response?: { data?: { message?: string }; status?: number };
  message?: string;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'employee';
  avatar?: string;
  employeeId?: string;
  tenantId: { _id: string; name?: string } | string;
  permissions?: { allowedTabs?: string[] };
  isActive: boolean;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

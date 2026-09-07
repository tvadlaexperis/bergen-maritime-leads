// Pure types + constants, zero imports — safe to import from client components
// (lib/db.ts pulls in node:path + @libsql/client and must stay server-only).

export type Role = 'viewer' | 'admin';
export type CompanyStatus = 'active' | 'hidden';

export interface CompanyFinancials {
  year: number;
  currency: string | null;
  revenue: number | null;
  operatingResult: number | null;
  pretaxResult: number | null;
  profit: number | null;
  equity: number | null;
  totalAssets: number | null;
  totalDebt: number | null;
  employees: number | null;
}

import { cookies } from 'next/headers';

// Company page layout: 'enkel' (the page alone) or 'delt' (the company list
// beside it — only on wide screens, see .company-split in globals.css).
// A cookie, like the theme, so the server renders the right layout at once.
export type CompanyView = 'enkel' | 'delt';
export const COMPANY_VIEW_COOKIE = 'company_view';

export function getCompanyView(): CompanyView {
  return cookies().get(COMPANY_VIEW_COOKIE)?.value === 'delt' ? 'delt' : 'enkel';
}

export interface Kommune {
  nr: string;
  name: string;
}

export interface NaceEntry {
  code: string;
  label: string;
  group: string;
}

export const KOMMUNER: Kommune[];
export const NACE_CODES: NaceEntry[];
export function matchNace(codes: (string | null | undefined)[]): NaceEntry | null;

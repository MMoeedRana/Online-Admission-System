import type { RecordLevel } from '../../constants/academics';
import { RegistryRowModel } from './registry.models';

export interface OfficialResult {
  _id: unknown;
  board: string;
  level: string;
  year: number;
  rollNo: string;
  studentName: string;
  fatherName: string;
  obtained: number;
  total: number;
  subjects: { name?: string | null; obtained?: number | null; total?: number | null }[];
}

/**
 * REG-6: the matching service talks to this interface only, so an official board API can
 * replace the imported registry later without changing the rest of the system.
 */
export interface ResultSource {
  lookup(q: {
    board: string;
    level: RecordLevel;
    year: number;
    rollNo: string;
  }): Promise<OfficialResult | null>;
}

/** Imported result gazettes; entry-test results may be private to the institution that imported them (REG-5). */
export const registryResultSource: ResultSource = {
  async lookup(q) {
    const filter: Record<string, unknown> = {
      board: q.board,
      level: q.level,
      year: q.year,
      rollNo: q.rollNo.trim().toUpperCase(),
    };
    if (q.level !== 'ENTRY_TEST') filter.institutionId = null;
    return (await RegistryRowModel.findOne(filter).lean()) as OfficialResult | null;
  },
};

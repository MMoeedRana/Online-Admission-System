import type { ClientSession } from 'mongoose';
import { slugify } from '../../lib/slug';
import type { Id } from '../../lib/types';
import { InstitutionModel } from '../institutions/institution.model';
import { ProgramModel, totalSeats } from '../programs/program.model';
import { CampusModel } from '../structure/structure.models';
import { DirInstitutionModel, DirProgramModel, MeritHistoryModel } from './directory.models';

/** Directory profile of an ADMITRA institution, created on first use and kept in step. */
export async function ensureDirectoryInstitution(institutionId: Id, session?: ClientSession) {
  const existing = await DirInstitutionModel.findOne({ institutionId }).session(session ?? null);
  if (existing) return existing;
  const inst = await InstitutionModel.findById(institutionId)
    .session(session ?? null)
    .lean();
  if (!inst) throw new Error('Institution not found');
  const campuses = await CampusModel.find({ institutionId })
    .session(session ?? null)
    .lean();
  // A directory entry with the same name may exist already (entered before the institution joined).
  const byName = await DirInstitutionModel.findOne({ name: inst.name, institutionId: null }).session(
    session ?? null,
  );
  if (byName) {
    byName.institutionId = inst._id as never;
    await byName.save({ session });
    return byName;
  }
  const [doc] = await DirInstitutionModel.create(
    [
      {
        name: inst.name,
        shortName: inst.shortName,
        slug: `${slugify(inst.name)}-${String(inst._id).slice(-4)}`,
        type: inst.type,
        sector: inst.sector,
        city: inst.city,
        province: inst.province,
        website: inst.website ?? '',
        about: inst.about ?? '',
        campuses: campuses.map((c) => ({ name: c.name, city: c.city })),
        institutionId: inst._id,
      },
    ],
    { session },
  );
  return doc!;
}

/** Directory program of an ADMITRA program (DIR-5). */
export async function ensureDirectoryProgram(programId: Id, session?: ClientSession) {
  const existing = await DirProgramModel.findOne({ programId }).session(session ?? null);
  if (existing) return existing;
  const p = await ProgramModel.findById(programId)
    .session(session ?? null)
    .lean();
  if (!p) throw new Error('Program not found');
  const di = await ensureDirectoryInstitution(p.institutionId, session);
  const [doc] = await DirProgramModel.create(
    [
      {
        directoryInstitutionId: di._id,
        programId: p._id,
        title: p.title,
        degreeLevel: p.degreeLevel,
        fieldGroup: p.fieldGroup,
        durationYears: p.durationYears,
        feePerSemester: p.admissionFee,
        shifts: p.shifts.map((s) => s.name),
        seats: totalSeats(p),
        eligibility: p.eligibility.map((e) => ({
          level: e.level,
          minPercentage: e.minPercentage,
          groups: e.groups,
        })),
        testName: p.testName,
        admissionMonths: [7, 8, 9],
      },
    ],
    { session },
  );
  return doc!;
}

/**
 * DIR-5: on publication the closing aggregate of every program and shift is stored as
 * verified history marked "Official (ADMITRA)".
 */
export async function recordOfficialMerit(
  list: {
    listNumber: number;
    pools: {
      programId: unknown;
      shift: string;
      seats?: number | null;
      openingAggregate?: number | null;
      closingAggregate?: number | null;
    }[];
  },
  campaign: { title: string; opensAt: Date },
  institutionName: string,
  session: ClientSession,
) {
  const year = new Date(campaign.opensAt).getFullYear();
  for (const pool of list.pools) {
    if (pool.closingAggregate == null) continue;
    const dp = await ensureDirectoryProgram(pool.programId as Id, session);
    await MeritHistoryModel.updateOne(
      {
        directoryProgramId: dp._id,
        year,
        round: list.listNumber,
        shift: pool.shift as 'MORNING',
        quota: 'OPEN',
      },
      {
        $set: {
          openingMerit: pool.openingAggregate ?? null,
          closingMerit: pool.closingAggregate,
          seats: pool.seats ?? null,
          source: `Official (ADMITRA): ${institutionName}, ${campaign.title}, merit list ${list.listNumber}`,
          origin: 'ADMITRA',
          status: 'VERIFIED',
          verifiedAt: new Date(),
        },
      },
      { upsert: true, session },
    );
  }
}

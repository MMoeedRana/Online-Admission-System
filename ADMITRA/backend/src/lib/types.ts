import type { Types } from 'mongoose';

/** A MongoDB id given either as an ObjectId or as its string form. */
export type Id = Types.ObjectId | string;

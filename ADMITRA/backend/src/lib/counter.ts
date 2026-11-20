import { Schema, model, type ClientSession } from 'mongoose';

const counterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});
const CounterModel = model('Counter', counterSchema);

export async function nextSeq(key: string, session?: ClientSession): Promise<number> {
  const c = await CounterModel.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', session },
  );
  return c!.seq;
}

export const pad = (n: number, width: number) => String(n).padStart(width, '0');

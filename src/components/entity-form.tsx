import Link from "next/link";
import { ENTITIES, loadRefOptions, type EntityKey } from "@/server/entities";
import { saveEntity } from "@/server/actions";
import { FormFields } from "./fields";
import { Submit } from "./client";

export async function EntityForm({ entity, id, values, back, defaults }: { entity: EntityKey; id?: string; values?: Record<string, unknown>; back?: string; defaults?: Record<string, unknown> }) {
  const e = ENTITIES[entity];
  const refs = await loadRefOptions(e.fields);
  const action = saveEntity.bind(null, entity, id ?? null);
  return (
    <form action={action} className="card"><div className="card-b">
      {back ? <input type="hidden" name="_back" value={back} /> : null}
      <FormFields fields={e.fields} values={values ?? defaults} refs={refs} />
      <div className="form-foot">
        <Link className="btn ghost" href={back ?? (id ? e.path(id) : e.listPath)}>Cancel</Link>
        <Submit>{id ? "Save changes" : `Create ${e.label.toLowerCase()}`}</Submit>
      </div>
    </div></form>
  );
}

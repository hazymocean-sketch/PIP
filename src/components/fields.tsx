import type { FieldDef, RefKey } from "@/lib/fields";

type Opts = Partial<Record<RefKey, { value: string; label: string; group?: string }[]>>;

function toInputValue(f: FieldDef, v: unknown): string {
  if (v === null || v === undefined) return "";
  if (f.type === "datetime") { const d = new Date(v as string); if (isNaN(d.getTime())) return ""; const off = d.getTimezoneOffset(); return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16); }
  if (f.type === "money") return String(Number(v));
  return String(v);
}

export function FormFields({ fields, values = {}, refs = {}, only }: { fields: FieldDef[]; values?: Record<string, unknown>; refs?: Opts; only?: string[] }) {
  const list = only ? fields.filter((f) => only.includes(f.name)) : fields;
  return (
    <div className="fields">
      {list.map((f) => {
        const id = `f-${f.name}`;
        const v = toInputValue(f, values[f.name]);
        let input: React.ReactNode;
        switch (f.type) {
          case "textarea": input = <textarea id={id} name={f.name} defaultValue={v} placeholder={f.placeholder} required={f.required} />; break;
          case "select": input = (
            <select id={id} name={f.name} defaultValue={v || f.options![0]?.value} required={f.required}>
              {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>); break;
          case "ref": {
            const options = refs[f.ref!] ?? [];
            const groups = [...new Set(options.map((o) => o.group).filter(Boolean))] as string[];
            input = (
              <select id={id} name={f.name} defaultValue={v}>
                <option value="">— None —</option>
                {groups.length
                  ? groups.map((g) => <optgroup key={g} label={g}>{options.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>)
                  : options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>); break;
          }
          case "checkbox": input = <label className="check"><input type="checkbox" id={id} name={f.name} defaultChecked={!!values[f.name]} /> {f.label}</label>; break;
          default: {
            const type = { url: "url", email: "email", int: "number", money: "text", date: "date", datetime: "datetime-local", text: "text" }[f.type] ?? "text";
            input = <>
              <input id={id} name={f.name} type={type} defaultValue={v} placeholder={f.placeholder} required={f.required} list={f.datalist ? `${id}-dl` : undefined} inputMode={f.type === "money" ? "decimal" : undefined} />
              {f.datalist ? <datalist id={`${id}-dl`}>{f.datalist.map((d) => <option key={d} value={d} />)}</datalist> : null}
            </>;
          }
        }
        return (
          <div key={f.name} className={`field${f.wide ? " wide" : ""}`}>
            {f.type !== "checkbox" ? <label htmlFor={id}>{f.label}{f.required ? <span className="req"> *</span> : null}</label> : null}
            {input}
            {f.help ? <span className="help">{f.help}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

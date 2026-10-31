import { workbookValue } from "../lib/workbook-format";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Loading, ErrorNotice } from "./shared";
// The API exposes ordinary, permission-filtered database fields, never import provenance.
export function WorkbookDetails({
  id,
  columns,
}: {
  id: string;
  columns?: number[];
}) {
  const query = useQuery({
    queryKey: ["personnel-details", id],
    queryFn: () =>
      api<{ data: { column: number; label: string; value: string }[] }>(
        "/officers/" + id + "/personnel-details",
      ),
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} />;
  return (
    <dl className="detail-grid">
      {query.data.data
        .filter((f) => !columns || columns.includes(f.column))
        .map((field) => (
          <div key={field.column}>
            <dt>{field.label}</dt>
            <dd style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {workbookValue(field.value, field.column) || "Not recorded"}
            </dd>
          </div>
        ))}
    </dl>
  );
}

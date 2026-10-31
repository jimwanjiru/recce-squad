import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Pagination } from "./Pagination";
import { Loading, ErrorNotice } from "./shared";
export function PersonnelSummaries() {
  const { can } = useAuth();
  const [section, setSection] = useState("SUB UNIT STRENGTH"),
    [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["personnel-summaries", section, page],
    queryFn: () =>
      api<{
        data: { id: string; fields: { label: string; value: string }[] }[];
        meta: { total: number };
      }>(
        `/personnel-summaries?section=${encodeURIComponent(section)}&page=${page}`,
      ),
  });
  return (
    <section className="card panel-padding">
      <h2>Recorded comparisons and additional information</h2>
      <p>These historical comparisons do not set current personnel policies.</p>
      <select
        aria-label="Comparison category"
        value={section}
        onChange={(e) => {
          setSection(e.target.value);
          setPage(1);
        }}
      >
        <option value="SUB UNIT STRENGTH">Sub-unit strength</option>
        {can("fields.ethnicity.view") && (
          <option value="TRIBE">Ethnicity</option>
        )}
      </select>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error} />
      ) : query.data.data.length ? (
        query.data.data.map((record) => (
          <article key={record.id} className="history-entry">
            <dl className="detail-grid">
              {record.fields
                .filter((f) => f.value)
                .map((f, i) => (
                  <div key={i}>
                    <dt>{f.label}</dt>
                    <dd style={{ whiteSpace: "pre-wrap" }}>
                      {f.value.startsWith("#") ? "Unavailable" : f.value}
                    </dd>
                  </div>
                ))}
            </dl>
          </article>
        ))
      ) : (
        <p>No comparison recorded.</p>
      )}
      <Pagination
        page={page}
        pageSize={25}
        total={query.data?.meta.total || 0}
        onPage={setPage}
        label="Recorded comparison pagination"
      />
    </section>
  );
}

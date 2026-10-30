import { workbookValue, reviewTime } from "../lib/workbook-format";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Loading, ErrorNotice } from "./shared";
type Review = {
  decision: "CHECKED" | "NEEDS_CORRECTION";
  revision: number;
  reviewedById: string;
  reviewedAt: string;
};
type SourceRow = {
  identityCheck: { forceNumberMatches: boolean; nameMatches: boolean };
  rowId: string;
  batchId: string;
  sheet: string;
  row: number;
  fields: {
    column: number;
    label: string;
    value: string;
    review: Review | null;
    canReview: boolean;
  }[];
};
function OtherSheets({ batchId }: { batchId: string }) {
  const [sheet, setSheet] = useState("CHANGES"),
    [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["workbook-source", batchId, sheet, page],
    queryFn: () =>
      api<{
        data: { row: number; cells: { column: number; value: string }[] }[];
      }>(
        "/workbook-source?batchId=" +
          encodeURIComponent(batchId) +
          "&sheet=" +
          encodeURIComponent(sheet) +
          "&page=" +
          page,
      ),
  });
  return (
    <details>
      <summary>Other workbook sheets</summary>
      <p>
        Workbook codes: MO = Main Office; NA = Not assigned / Not applicable; R
        = Recce.
      </p>
      <p>
        Original source rows. Section labels and totals are preserved for
        review; they do not establish officer movements or strength policies.
      </p>
      <select
        aria-label="Workbook sheet"
        value={sheet}
        onChange={(e) => {
          setSheet(e.target.value);
          setPage(1);
        }}
      >
        {["CHANGES", "TRIBE", "SUB UNIT STRENGTH"].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error} />
      ) : (
        <div>
          {query.data.data.map((row) => (
            <div key={row.row}>
              <strong>Row {row.row}</strong>
              <dl className="detail-grid workbook-grid">
                {row.cells
                  .filter((c) => c.value)
                  .map((cell) => (
                    <div key={cell.column}>
                      <dt>Column {cell.column}</dt>
                      <dd
                        style={{
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {workbookValue(cell.value)}
                      </dd>
                    </div>
                  ))}
              </dl>
            </div>
          ))}
        </div>
      )}
      <Button
        variant="outline"
        disabled={page === 1}
        onClick={() => setPage(page - 1)}
      >
        Previous
      </Button>
      <Button
        variant="outline"
        disabled={!query.data || query.data.data.length < 25}
        onClick={() => setPage(page + 1)}
      >
        Next
      </Button>
    </details>
  );
}
export function WorkbookDetails({
  id,
  columns,
}: {
  id: string;
  columns?: number[];
}) {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["workbook-details", id],
    refetchOnMount: "always",
    queryFn: () =>
      api<{ data: SourceRow[] }>("/officers/" + id + "/workbook-details"),
  });
  const review = useMutation({
    mutationFn: ({
      rowId,
      column,
      decision,
      expectedRevision,
    }: {
      rowId: string;
      column: number;
      decision: Review["decision"];
      expectedRevision: number;
    }) =>
      api("/officers/" + id + "/workbook-details/" + rowId + "/review", {
        method: "POST",
        body: { column, decision, expectedRevision },
      }),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: ["workbook-details", id] }),
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} />;
  return (
    <div className="workbook-details">
      <p>
        Original workbook information awaiting review. Checking a source field
        records your review; official ranks, assignments and historical dates
        require separate verified records.
      </p>
      {review.error && <ErrorNotice error={review.error} />}
      {!query.data.data.length && (
        <p>No linked workbook source is available for this officer.</p>
      )}
      {query.data.data.map((row) => (
        <section key={row.rowId}>
          {!columns && <OtherSheets batchId={row.batchId} />}
          {!row.identityCheck.nameMatches && (
            <p role="alert">
              The current officer name differs from the workbook name. Compare
              both before reviewing these details.
            </p>
          )}
          <p>
            <strong>
              {row.sheet}, row {row.row}
            </strong>
          </p>
          <dl className="detail-grid workbook-grid">
            {row.fields
              .filter((field) => !columns || columns.includes(field.column))
              .map((field) => (
                <div key={field.column} className="workbook-field">
                  <dt>{field.label}</dt>
                  <dd
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {workbookValue(field.value, field.column) ||
                      "Blank in source"}
                  </dd>
                  <p className="workbook-review-status">
                    {field.review
                      ? (field.review.decision === "CHECKED"
                          ? "Source checked"
                          : "Needs correction") +
                        " · " +
                        reviewTime(field.review.reviewedAt)
                      : "Pending verification"}
                  </p>
                  {field.canReview && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={review.isPending}
                        onClick={() =>
                          review.mutate({
                            rowId: row.rowId,
                            column: field.column,
                            decision: "CHECKED",
                            expectedRevision: field.review?.revision || 0,
                          })
                        }
                      >
                        Mark checked
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={review.isPending}
                        onClick={() =>
                          review.mutate({
                            rowId: row.rowId,
                            column: field.column,
                            decision: "NEEDS_CORRECTION",
                            expectedRevision: field.review?.revision || 0,
                          })
                        }
                      >
                        Needs correction
                      </Button>
                    </div>
                  )}
                </div>
              ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Options } from "../lib/api";
import { Button } from "./ui/button";
import { ErrorNotice, Loading } from "./shared";

export function RankBaseline({ id, saved }: { id: string; saved: () => void }) {
  const formId = useId(),
    cache = useQueryClient();
  const [rankId, setRank] = useState(""),
    [date, setDate] = useState("");
  const [spelling, setSpelling] = useState(""),
    [specialist, setSpecialist] = useState("");
  const [reference, setReference] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const options = useQuery({
    queryKey: ["officer-options"],
    queryFn: () => api<{ data: Options }>("/officer-options"),
  });
  const mutation = useMutation({
    mutationFn: () =>
      api("/officers/" + id + "/rank-baseline", {
        method: "POST",
        body: {
          rankId,
          effectiveFrom: date,
          datesVerified: confirmed,
          originalRankSpelling: spelling.trim() || null,
          specialistDesignation: specialist.trim() || null,
          referenceNumber: reference.trim() || null,
        },
      }),
    onSuccess: () => {
      saved();
      void cache.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== "session",
      });
    },
  });
  return (
    <details className="rank-baseline-form">
      <summary>Verify initial rank</summary>
      <p>
        Use this once, when this officer has no existing rank or movement
        history. Confirm the overall rank and its actual effective date against
        an authoritative personnel record. Leave unknown dates unresolved.
      </p>
      {options.isPending ? (
        <Loading />
      ) : options.error ? (
        <ErrorNotice error={options.error} />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          {mutation.error && <ErrorNotice error={mutation.error} />}
          {!options.data?.data.ranks.length && (
            <p>
              Add the appropriate rank reference in Organization → Ranks before
              verification.
            </p>
          )}
          <div className="form-grid">
            <label htmlFor={formId + "-rank"}>
              Overall rank (Rank 2)
              <select
                aria-label="Overall rank (Rank 2)"
                id={formId + "-rank"}
                value={rankId}
                onChange={(e) => setRank(e.target.value)}
                required
                disabled={mutation.isPending}
              >
                <option value="">Select the confirmed rank</option>
                {options.data?.data.ranks.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} · {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={formId + "-date"}>
              Verified rank effective date
              <input
                id={formId + "-date"}
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={mutation.isPending}
              />
            </label>
            <label htmlFor={formId + "-spelling"}>
              Original rank spelling (Rank 1)
              <input
                id={formId + "-spelling"}
                maxLength={191}
                value={spelling}
                onChange={(e) => setSpelling(e.target.value)}
                placeholder="For example, Cpl/Drv or C.I(W)"
                disabled={mutation.isPending}
              />
            </label>
            <label htmlFor={formId + "-specialist"}>
              Specialist designation (if recorded separately)
              <input
                id={formId + "-specialist"}
                maxLength={191}
                value={specialist}
                onChange={(e) => setSpecialist(e.target.value)}
                disabled={mutation.isPending}
              />
            </label>
            <label htmlFor={formId + "-reference"}>
              Document reference (if available)
              <input
                id={formId + "-reference"}
                maxLength={191}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={mutation.isPending}
              />
            </label>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              required
              disabled={mutation.isPending}
            />
            I have checked this officer, rank and effective date against an
            authoritative record.
          </label>
          <Button
            type="submit"
            disabled={mutation.isPending || !rankId || !date || !confirmed}
          >
            {mutation.isPending ? "Saving…" : "Save verified initial rank"}
          </Button>
        </form>
      )}
    </details>
  );
}

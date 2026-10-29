import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { AlertCircle, LoaderCircle, Search } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "./ui/button";
import { Option, message } from "../lib/api";
export function ErrorNotice({ error }: { error: unknown }) {
  return (
    <div className="notice error" role="alert">
      <AlertCircle size={18} />
      <span>{message(error)}</span>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading-block" role="status">
      <LoaderCircle className="spin" size={22} /> Loading records…
    </div>
  );
}
export function Empty({
  title = "No records yet",
  description = "Records will appear here when they are added.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty">
      <Search size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function Confirm({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  pending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  pending: boolean;
  error: unknown;
}) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={pending ? undefined : onOpenChange}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog">
          <AlertDialog.Title>{title}</AlertDialog.Title>
          <AlertDialog.Description>{description}</AlertDialog.Description>
          {Boolean(error) && <ErrorNotice error={error} />}
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button variant="danger" onClick={onConfirm} disabled={pending}>
              {pending ? "Saving…" : "Confirm"}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
export function SearchSelect({
  options,
  value,
  onChange,
  id,
  disabled = false,
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  id: string;
  disabled?: boolean;
}) {
  const list = useId();
  const label = (o: Option) => (o.code ? `${o.code} · ${o.name}` : o.name);
  const [query, setQuery] = useState<string | null>(null);
  const selected = options.find((o) => o.id === value);
  return (
    <>
      <input
        id={id}
        list={list}
        value={query ?? (selected ? label(selected) : "")}
        disabled={disabled}
        placeholder={
          options.length
            ? "Search or choose…"
            : "No reference values configured"
        }
        onChange={(event) => {
          const text = event.target.value;
          setQuery(text);
          onChange(options.find((o) => label(o) === text)?.id ?? "");
        }}
        onBlur={() => setQuery(null)}
      />
      <datalist id={list}>
        {options.map((option) => (
          <option key={option.id} value={label(option)} />
        ))}
      </datalist>
    </>
  );
}

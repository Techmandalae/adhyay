import type { ReactNode } from "react";

type DataTableProps = {
  columns: string[];
  rows: Array<Array<ReactNode>>;
};

export function DataTable({ columns, rows }: DataTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-y-2 text-sm">
        <thead className="text-left text-xs uppercase tracking-[0.2em] text-ink-soft">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-2">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0] ?? "row"}-${index}`} className="rounded-2xl bg-white/70">
              {row.map((cell, cellIndex) => (
                <td key={`${index}-${cellIndex}`} className="px-3 py-2">
                  {cell ?? "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

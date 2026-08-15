import Link from "next/link"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function NodeTable({
  items,
}: {
  items: Array<{
    id: string
    displayName: string
    mediaType: string
    status: string
    providers: string[]
    mediums: string[]
    updatedAt: Date
  }>
}) {
  return (
    <div className="rounded-xl border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Ownership</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <Link href={`/library/${item.id}`} className="font-medium hover:underline">
                  {item.displayName}
                </Link>
              </TableCell>
              <TableCell>{item.mediaType.replaceAll("_", " ")}</TableCell>
              <TableCell>{item.status.replaceAll("_", " ")}</TableCell>
              <TableCell>{item.providers.join(", ") || "Manual"}</TableCell>
              <TableCell>{item.mediums.join(", ") || "—"}</TableCell>
              <TableCell>{item.updatedAt.toLocaleDateString()}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

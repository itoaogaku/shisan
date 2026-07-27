import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number;
  emphasis?: boolean;
  className?: string;
}

export function StatCard({ label, value, emphasis, className }: StatCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-0">
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn("font-semibold", emphasis ? "text-3xl" : "text-2xl")}>
          {formatYen(value)}
        </p>
      </CardContent>
    </Card>
  );
}

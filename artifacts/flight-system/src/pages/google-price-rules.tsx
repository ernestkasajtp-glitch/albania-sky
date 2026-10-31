import { TrendingUp } from "lucide-react";
import { GooglePriceRulesSection } from "@/pages/settings";

export default function GooglePriceRulesPage() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900">
          <TrendingUp className="h-6 w-6 text-sky-600" />
          Rregullat e Çmimeve
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Menaxho rregullat automatike të çmimeve sipas Google Flights.
        </p>
      </div>

      <GooglePriceRulesSection />
    </div>
  );
}
import { redirect } from "next/navigation";

export default function RatesPage() {
  redirect("/explore?tab=utilities&mode=table");
}

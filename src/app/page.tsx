import { redirect } from "next/navigation";

// Landing route opens the Pipeline — the primary working view and the
// strongest first impression for the hosted demo. The Today view moved to
// `/today` (linked directly beneath Pipeline in the sidebar). Kept as a thin
// redirect rather than duplicating the board so there is a single source of
// truth for the pipeline read model.
export default function Home() {
  redirect("/board");
}

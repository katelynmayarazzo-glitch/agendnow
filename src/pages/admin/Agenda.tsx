import { useAdmin } from "./AdminLayout";
import CalendarAgenda from "./CalendarAgenda";
import AgendaTimeline from "./AgendaTimeline";

/** Clínicas: agenda em grade (estilo Google Agenda). Barbearias, salões e estética: linha do tempo. */
export default function Agenda() {
  const { terms } = useAdmin();
  return terms.clinical ? <CalendarAgenda /> : <AgendaTimeline />;
}

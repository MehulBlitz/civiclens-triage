import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  loadTickets, persistTickets, nextTicketId, fileTicket, advanceStatus,
  loadKarma, saveKarma, type Ticket,
} from "./lib/tickets";
import { KARMA_POINTS } from "./lib/tickets";

type Store = {
  tickets: Ticket[];
  karma: number;
  addTicket: (input: { text: string; location: string; ward: string; reporter: string; hasPhoto: boolean }) => Ticket;
  cosign: (id: number) => void;
  advance: (id: number) => void;
};

const Ctx = createContext<Store | null>(null);

export function TicketProvider({ children }: { children: React.ReactNode }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [karma, setKarma] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = loadTickets();
    setTickets(t);
    setKarma(loadKarma());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) persistTickets(tickets, nextTicketId(tickets));
  }, [tickets, ready]);

  const store = useMemo<Store>(
    () => ({
      tickets,
      karma,
      addTicket: (input) => {
        const t = fileTicket(tickets, input);
        setTickets((prev) => [...prev, t]);
        setKarma((k) => {
          const gained = KARMA_POINTS.report + (input.hasPhoto ? KARMA_POINTS.photo : 0);
          const nk = k + gained;
          saveKarma(nk);
          return nk;
        });
        return t;
      },
      cosign: (id) => {
        setTickets((prev) =>
          prev.map((t) => (t.id === id ? { ...t, cosigns: t.cosigns + 1 } : t))
        );
        setKarma((k) => {
          const nk = k + KARMA_POINTS.cosign;
          saveKarma(nk);
          return nk;
        });
      },
      advance: (id) => {
        setTickets((prev) =>
          prev.map((t) => {
            if (t.id !== id) return t;
            const status = advanceStatus(t.status);
            return {
              ...t,
              status,
              timeline: [...t.timeline, { at: Date.now(), label: `Advanced to ${status}` }],
            };
          })
        );
      },
    }),
    [tickets, karma]
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useTickets(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTickets must be used inside <TicketProvider>");
  return v;
}

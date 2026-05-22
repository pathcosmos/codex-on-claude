package billing

import (
  "context"
  "time"
)

type Queue interface { Receive(ctx context.Context) (*Message, error); Ack(ctx context.Context, id string) error }
type Message struct { ID string; AccountID string; AmountCents int; EventID string }
type Ledger interface { Charge(ctx context.Context, account string, cents int) error; MarkProcessed(ctx context.Context, event string) error }

func Run(ctx context.Context, q Queue, ledger Ledger) error {
  for {
    msg, err := q.Receive(ctx)
    if err != nil { return err }
    if msg == nil { time.Sleep(100 * time.Millisecond); continue }

    if err := ledger.Charge(ctx, msg.AccountID, msg.AmountCents); err != nil {
      continue
    }
    _ = ledger.MarkProcessed(ctx, msg.EventID)
    if err := q.Ack(ctx, msg.ID); err != nil {
      return err
    }
  }
}
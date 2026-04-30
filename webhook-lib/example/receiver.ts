import { createServer } from "node:http";

const port = Number(process.env.RECEIVER_PORT ?? 4010);

const server = createServer((req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end();
    return;
  }
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c as Buffer));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    const event = req.headers["x-webhook-event"];
    console.log(`[receiver] event=${String(event)} body=${body}`);
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  });
});

server.listen(port, () => {
  console.log(`Receiver listening on http://127.0.0.1:${port}`);
});

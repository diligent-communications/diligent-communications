// The largest body the host reads, in bytes, on the operation address and on
// the agent connection alike.
export const BODY_LIMIT = 65_536;

// Reads a request's body up to the limit and no further. The length a request
// declares is neither needed nor trusted: the bytes are counted as they
// arrive, and the read stops as soon as more than the limit has come in. A
// body over the limit is nothing (`null`), and the rest of it is never read.
export async function readBody(request: { body: ReadableStream<Uint8Array> | null }, limit: number = BODY_LIMIT): Promise<string | null> {
  if (request.body === null) {
    return '';
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return text + decoder.decode();
    }
    received += value.byteLength;
    if (received > limit) {
      // Tell the sender to stop. Whatever is still on its way is not read.
      await reader.cancel().catch(() => undefined);
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

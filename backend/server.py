"""Dev-preview bridge: the RODE app is a Next.js project (frontend/). Kubernetes ingress sends /api/* to port 8001,
so this proxy forwards those requests unchanged to the Next.js server on port 3000. Not used on Vercel."""
import os

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import Response

NEXT_URL = os.environ.get("NEXT_INTERNAL_URL", "http://127.0.0.1:3000")
HOP = {"connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "content-length", "content-encoding"}

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
client = httpx.AsyncClient(base_url=NEXT_URL, timeout=httpx.Timeout(60.0, connect=10.0), follow_redirects=False)


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy(path: str, request: Request):
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP}
    host = request.headers.get("host", "")
    headers["x-forwarded-host"] = request.headers.get("x-forwarded-host", host)
    headers["x-forwarded-proto"] = request.headers.get("x-forwarded-proto", "https")
    body = await request.body()
    try:
        r = await client.request(request.method, f"/api/{path}", params=request.query_params.multi_items(),
                                 headers=headers, content=body)
    except httpx.HTTPError:
        return Response('{"error":"Server aplikasi sedang dimulai. Coba lagi beberapa detik."}', status_code=503,
                        media_type="application/json")
    resp = Response(content=r.content, status_code=r.status_code)
    for k, v in r.headers.multi_items():
        if k.lower() not in HOP:
            resp.headers.append(k, v)
    return resp

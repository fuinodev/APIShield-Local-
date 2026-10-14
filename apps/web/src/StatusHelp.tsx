export function StatusHelp({status}:{status:number}) {
  const advice = status===400 ? 'Check the request path, headers, and JSON body.'
    : status===401 ? 'Authentication is required or invalid. Check your key, token, and route policy.'
    : status===403 ? 'Access denied. Check IP rules and backend permissions.'
    : status===404 ? 'Route not found. Check the path and gateway status.'
    : status===413 ? 'Payload too large. Reduce its size or adjust the request limit.'
    : status===429 ? 'Rate limit reached. Wait for the Retry-After interval.'
    : status===502 || status===504 ? 'Check backend availability, timeout, TLS, and response size.'
    : status===503 ? 'Check backend health and gateway database connectivity.'
    : status>=500 ? 'Backend error. Check its application logs.'
    : status>=300 && status<400 ? 'Redirect not followed. Inspect the Location header.'
    : null;
  return advice ? <div className="diagnostic">{advice}</div> : null;
}

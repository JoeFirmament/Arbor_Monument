const VISITOR_COOKIE = "tree_explorer_visitor";
const VISITOR_PATTERN = /^[a-zA-Z0-9-]{20,80}$/;

export type Visitor = {
  key: string;
  setCookie: string | null;
};

export function getVisitor(request: Request): Visitor {
  const cookie = request.headers.get("cookie") ?? "";
  const current = cookie
    .split(";")
    .map((item) => item.trim().split("="))
    .find(([name]) => name === VISITOR_COOKIE)?.[1];

  if (current && VISITOR_PATTERN.test(current)) {
    return { key: current, setCookie: null };
  }

  const key = crypto.randomUUID();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return {
    key,
    setCookie: `${VISITOR_COOKIE}=${key}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`,
  };
}

export function json(
  body: unknown,
  status = 200,
  visitor?: Visitor,
): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (visitor?.setCookie) headers.set("Set-Cookie", visitor.setCookie);
  return Response.json(body, { status, headers });
}

export function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/[<>]/g, "").trim().slice(0, maxLength)
    : "";
}

export function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function isSuzhouArea(latitude: number, longitude: number): boolean {
  return latitude >= 30.4 && latitude <= 32.3 && longitude >= 119.3 && longitude <= 121.6;
}

export function distanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusM = 6_371_000;
  const deltaLatitude = radians(latitudeB - latitudeA);
  const deltaLongitude = radians(longitudeB - longitudeA);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(radians(latitudeA)) *
      Math.cos(radians(latitudeB)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function databaseError(error: unknown): Response {
  console.error("location database error", error);
  const message = error instanceof Error ? error.message : "位置资料暂不可用";
  const unavailable = message.includes("暂不可用") || message.includes("no such table");
  return json(
    { error: unavailable ? "位置核实服务正在准备中，请稍后再试。" : "位置资料暂时无法保存，请稍后重试。" },
    503,
  );
}

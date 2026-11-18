import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEARCH_TERMS: Record<string, string> = {
  all: "featured pictures",
  nature: "featured nature landscape",
  animals: "featured animal photography",
  travel: "architecture city travel landscape",
  art: "illustration digital art artwork",
  design: "graphic design poster typography",
  people: "portrait photography",
};

type MetadataValue = { value?: string };
type CommonsImageInfo = {
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  mime?: string;
  extmetadata?: Record<string, MetadataValue>;
};
type CommonsPage = {
  pageid?: number;
  title?: string;
  imageinfo?: CommonsImageInfo[];
};

function plainText(value: unknown, maxLength = 240): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const parsed = Number(code);
      return Number.isFinite(parsed) && parsed >= 0 && parsed <= 0x10ffff
        ? String.fromCodePoint(parsed)
        : " ";
    })
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => {
      const parsed = Number.parseInt(code, 16);
      return Number.isFinite(parsed) && parsed >= 0 && parsed <= 0x10ffff
        ? String.fromCodePoint(parsed)
        : " ";
    })
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function metadata(info: CommonsImageInfo, key: string): string {
  return plainText(info.extmetadata?.[key]?.value);
}

export async function GET(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Sign in to browse free images." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const params = new URL(request.url).searchParams;
  const query = (params.get("q") || "").trim().slice(0, 100);
  const category = (params.get("category") || "all").toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(SEARCH_TERMS, category)) {
    return NextResponse.json(
      { error: "INVALID_CATEGORY", message: "Choose a supported image category." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const searchTerm = query || SEARCH_TERMS[category];
  const apiUrl = new URL("https://commons.wikimedia.org/w/api.php");
  apiUrl.searchParams.set("action", "query");
  apiUrl.searchParams.set("generator", "search");
  apiUrl.searchParams.set("gsrsearch", searchTerm);
  apiUrl.searchParams.set("gsrnamespace", "6");
  apiUrl.searchParams.set("gsrlimit", "24");
  apiUrl.searchParams.set("prop", "imageinfo");
  apiUrl.searchParams.set("iiprop", "url|extmetadata");
  apiUrl.searchParams.set("iiextmetadatafilter", "LicenseShortName|LicenseUrl|Artist|Credit");
  apiUrl.searchParams.set("iiurlwidth", "720");
  apiUrl.searchParams.set("format", "json");
  apiUrl.searchParams.set("formatversion", "2");

  try {
    const response = await fetch(apiUrl.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "BALMZ-AI/1.0 (https://balmz-ai.onrender.com)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "IMAGE_SOURCE_UNAVAILABLE", message: "The free image library is temporarily unavailable. Please try again." },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const payload = await response.json() as { query?: { pages?: CommonsPage[] } };
    const images = (payload.query?.pages ?? []).flatMap((page) => {
      const info = page.imageinfo?.[0];
      if (!info?.thumburl || !info.url || !info.descriptionurl) return [];
      if (!info.thumburl.startsWith("https://upload.wikimedia.org/") ||
          !info.url.startsWith("https://upload.wikimedia.org/") ||
          !info.descriptionurl.startsWith("https://commons.wikimedia.org/")) return [];

      const license = metadata(info, "LicenseShortName");
      const licenseUrl = metadata(info, "LicenseUrl",);
      if (!license) return [];

      const filename = (page.title || "Commons image").replace(/^File:/, "");
      return [{
        id: String(page.pageid ?? filename),
        title: filename.replace(/_/g, " ").slice(0, 160),
        filename,
        thumbnailUrl: info.thumburl,
        originalUrl: info.url,
        descriptionUrl: info.descriptionurl,
        creator: metadata(info, "Artist") || metadata(info, "Credit") || "Creator details on Commons",
        license,
        licenseUrl: licenseUrl.startsWith("https://") ? licenseUrl : "https://commons.wikimedia.org/wiki/Commons:Licensing",
      }];
    });

    return NextResponse.json(
      {
        source: "Wikimedia Commons",
        query: searchTerm,
        images,
        notice: "Files on Commons have free-use licenses, but conditions differ by image. Review the file page and license before reusing; creator credit is shown where available.",
      },
      { headers: { "Cache-Control": "private, max-age=180, stale-while-revalidate=900" } },
    );
  } catch {
    return NextResponse.json(
      { error: "IMAGE_SOURCE_UNAVAILABLE", message: "The free image library could not be reached. Please check your connection and try again." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

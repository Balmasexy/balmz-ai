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


const UNSPLASH_LICENSE = "https://unsplash.com/license";
const CURATED_PHOTOS: Array<{ id: string; title: string; category: string; photoId: string }> = [
  { id: "landscape-1", title: "Mountain lake at sunrise", category: "nature", photoId: "photo-1500530855697-b586d89ba3ee" },
  { id: "landscape-2", title: "Alpine landscape", category: "nature", photoId: "photo-1470770841072-f978cf4d019e" },
  { id: "coast-1", title: "Ocean coastline", category: "nature", photoId: "photo-1507525428034-b723cf961d3e" },
  { id: "animal-1", title: "Wildlife portrait", category: "animals", photoId: "photo-1518791841217-8f162f1e1131" },
  { id: "travel-1", title: "Coastal travel view", category: "travel", photoId: "photo-1500534623283-312aade485b7" },
  { id: "travel-2", title: "Mountain travel destination", category: "travel", photoId: "photo-1501785888041-af3ef285b470" },
  { id: "art-1", title: "Creative abstract color", category: "art", photoId: "photo-1541701494587-cb58502866ab" },
  { id: "design-1", title: "Minimal design workspace", category: "design", photoId: "photo-1498050108023-c5249f4df085" },
  { id: "people-1", title: "Portrait photography inspiration", category: "people", photoId: "photo-1534528741775-53994a69daeb" },
  { id: "people-2", title: "Natural portrait", category: "people", photoId: "photo-1500648767791-00dcc994a43e" },
];

function curatedFallback(category: string, query: string) {
  const search = query.toLowerCase();
  const selected = CURATED_PHOTOS.filter((photo) =>
    (category === "all" || photo.category === category) &&
    (!search || (photo.title + " " + photo.category).toLowerCase().includes(search)),
  );
  const results = selected.length ? selected : CURATED_PHOTOS.filter((photo) => category === "all" || photo.category === category);
  return results.map((photo) => {
    const imageUrl = "https://images.unsplash.com/" + photo.photoId + "?auto=format&fit=crop&w=900&q=82";
    return {
      id: "unsplash-" + photo.id,
      title: photo.title,
      filename: photo.title,
      thumbnailUrl: imageUrl,
      originalUrl: imageUrl,
      descriptionUrl: "https://unsplash.com/s/photos/" + encodeURIComponent(photo.category),
      creator: "Photographer credit available through Unsplash",
      license: "Unsplash License",
      licenseUrl: UNSPLASH_LICENSE,
    };
  });
}

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
      return NextResponse.json({
        source: "Unsplash curated fallback",
        query: searchTerm,
        images: curatedFallback(category, query),
        notice: "Showing curated Unsplash images because Wikimedia Commons is temporarily unavailable. Review the Unsplash license before reuse.",
      }, { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=900" } });
    }

    const payload = await response.json() as { query?: { pages?: CommonsPage[] } };
    const commonsImages = (payload.query?.pages ?? []).flatMap((page) => {
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

    const images = commonsImages.length ? commonsImages : curatedFallback(category, query);
    return NextResponse.json({
      source: commonsImages.length ? "Wikimedia Commons" : "Unsplash curated fallback",
      query: searchTerm,
      images,
      notice: commonsImages.length
        ? "Files on Commons have free-use licenses, but conditions differ by image. Review the file page and license before reusing; creator credit is shown where available."
        : "No suitable Wikimedia results were returned. Showing curated Unsplash images instead; review the Unsplash license before reuse.",
    }, { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=900" } });
  } catch {
    return NextResponse.json({
      source: "Unsplash curated fallback",
      query: searchTerm,
      images: curatedFallback(category, query),
      notice: "Showing curated Unsplash images because Wikimedia Commons could not be reached. Review the Unsplash license before reuse.",
    }, { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=900" } });
  }
}

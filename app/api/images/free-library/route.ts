import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEARCH_TERMS: Record<string, string> = {
  all: "featured pictures",
  nature: "featured nature landscape",
  animals: "wildlife animal photography",
  travel: "travel destination city landscape",
  art: "illustration digital art artwork",
  design: "graphic design poster typography",
  people: "portrait photography",
  food: "food photography cuisine dishes",
  technology: "technology computers electronics innovation",
  architecture: "architecture buildings interiors",
  business: "business teamwork office startup",
  fashion: "fashion editorial clothing style",
  sports: "sports athletes fitness action",
  education: "education learning classroom books",
  lifestyle: "lifestyle daily living wellness",
  space: "space astronomy planets galaxy",
  backgrounds: "abstract background texture",
  wallpapers: "wallpaper scenic abstract background",
};


const UNSPLASH_LICENSE = "https://unsplash.com/license";
const CURATED_PHOTOS: Array<{ id: string; title: string; category: string; photoId: string }> = [
  { id: "landscape-1", title: "Mountain lake at sunrise", category: "nature", photoId: "photo-1500530855697-b586d89ba3ee" },
  { id: "landscape-2", title: "Alpine landscape", category: "nature", photoId: "photo-1470770841072-f978cf4d019e" },
  { id: "coast-1", title: "Ocean coastline", category: "nature", photoId: "photo-1507525428034-b723cf961d3e" },

  { id: "animal-1", title: "Wildlife portrait", category: "animals", photoId: "photo-1518791841217-8f162f1e1131" },
  { id: "animal-2", title: "Elephant in the wild", category: "animals", photoId: "photo-1557050543-4d5f4e07ef46" },
  { id: "animal-3", title: "Bird in natural habitat", category: "animals", photoId: "photo-1444464666168-49d633b86797" },

  { id: "travel-1", title: "Coastal travel view", category: "travel", photoId: "photo-1500534623283-312aade485b7" },
  { id: "travel-2", title: "Mountain travel destination", category: "travel", photoId: "photo-1501785888041-af3ef285b470" },
  { id: "travel-3", title: "City travel architecture", category: "travel", photoId: "photo-1519608487953-e999c86e7455" },

  { id: "art-1", title: "Creative abstract color", category: "art", photoId: "photo-1541701494587-cb58502866ab" },
  { id: "art-2", title: "Modern illustration texture", category: "art", photoId: "photo-1549490349-8643362247b5" },
  { id: "art-3", title: "Colorful art composition", category: "art", photoId: "photo-1541961017774-22349e4a1262" },

  { id: "design-1", title: "Minimal design workspace", category: "design", photoId: "photo-1498050108023-c5249f4df085" },
  { id: "design-2", title: "Modern graphic design desk", category: "design", photoId: "photo-1558655146-9f40138edfeb" },
  { id: "design-3", title: "Creative typography and layout", category: "design", photoId: "photo-1507238691740-187a5b1d37b8" },

  { id: "people-1", title: "Portrait photography inspiration", category: "people", photoId: "photo-1534528741775-53994a69daeb" },
  { id: "people-2", title: "Natural portrait", category: "people", photoId: "photo-1500648767791-00dcc994a43e" },
  { id: "people-3", title: "Lifestyle portrait", category: "people", photoId: "photo-1531123897727-8f129e1688ce" },

  { id: "food-1", title: "Fresh healthy meal", category: "food", photoId: "photo-1540189549336-e6e99c3679fe" },
  { id: "food-2", title: "Restaurant food photography", category: "food", photoId: "photo-1504674900247-0877df9cc836" },
  { id: "food-3", title: "Fresh ingredients and cooking", category: "food", photoId: "photo-1490645935967-10de6ba17061" },

  { id: "tech-1", title: "Computer technology close-up", category: "technology", photoId: "photo-1518770660439-4636190af475" },
  { id: "tech-2", title: "Modern connected workspace", category: "technology", photoId: "photo-1519389950473-47ba0277781c" },
  { id: "tech-3", title: "Robotics and innovation", category: "technology", photoId: "photo-1485827404703-89b55fcc595e" },

  { id: "architecture-1", title: "Modern architectural exterior", category: "architecture", photoId: "photo-1487958449943-2429e8be8625" },
  { id: "architecture-2", title: "Minimal building lines", category: "architecture", photoId: "photo-1511818966892-d7d671e672a2" },
  { id: "architecture-3", title: "Contemporary interior design", category: "architecture", photoId: "photo-1600607687939-ce8a6c25118c" },

  { id: "business-1", title: "Team collaboration", category: "business", photoId: "photo-1521737711867-e3b97375f902" },
  { id: "business-2", title: "Modern professional office", category: "business", photoId: "photo-1497366216548-37526070297c" },
  { id: "business-3", title: "Business planning meeting", category: "business", photoId: "photo-1556761175-b413da4baf72" },

  { id: "fashion-1", title: "Fashion editorial inspiration", category: "fashion", photoId: "photo-1483985988355-763728e1935b" },
  { id: "fashion-2", title: "Street style portrait", category: "fashion", photoId: "photo-1539109136881-3be0616acf4b" },
  { id: "fashion-3", title: "Modern fashion styling", category: "fashion", photoId: "photo-1529139574466-a303027c1d8b" },

  { id: "sports-1", title: "Track and field action", category: "sports", photoId: "photo-1461896836934-ffe607ba8211" },
  { id: "sports-2", title: "Cycling and endurance", category: "sports", photoId: "photo-1517649763962-0c623066013b" },
  { id: "sports-3", title: "Stadium sports atmosphere", category: "sports", photoId: "photo-1531415074968-036ba1b575da" },

  { id: "education-1", title: "Learning and study", category: "education", photoId: "photo-1503676260728-1c00da094a0b" },
  { id: "education-2", title: "Graduation and achievement", category: "education", photoId: "photo-1523050854058-8df90110c9f1" },
  { id: "education-3", title: "Classroom learning", category: "education", photoId: "photo-1509062522246-3755977927d7" },

  { id: "lifestyle-1", title: "Everyday lifestyle scene", category: "lifestyle", photoId: "photo-1511988617509-a57c8a288659" },
  { id: "lifestyle-2", title: "Quiet morning outdoors", category: "lifestyle", photoId: "photo-1470252649378-9c29740c9fa8" },
  { id: "lifestyle-3", title: "Wellness and natural light", category: "lifestyle", photoId: "photo-1517841905240-472988babdf9" },

  { id: "space-1", title: "Earth from orbit", category: "space", photoId: "photo-1446776811953-b23d57bd21aa" },
  { id: "space-2", title: "Deep space and stars", category: "space", photoId: "photo-1462331940025-496dfbfc7564" },
  { id: "space-3", title: "Planetary sky and cosmos", category: "space", photoId: "photo-1419242902214-272b3f66ee7a" },

  { id: "background-1", title: "Soft abstract background", category: "backgrounds", photoId: "photo-1557683316-973673baf926" },
  { id: "background-2", title: "Warm abstract texture", category: "backgrounds", photoId: "photo-1550684848-fac1c5b4e853" },
  { id: "background-3", title: "Minimal gradient texture", category: "backgrounds", photoId: "photo-1557682250-33bd709cbe85" },

  { id: "wallpaper-1", title: "Mountain night wallpaper", category: "wallpapers", photoId: "photo-1519681393784-d120267933ba" },
  { id: "wallpaper-2", title: "Sunlit mountain wallpaper", category: "wallpapers", photoId: "photo-1470770841072-f978cf4d019e" },
  { id: "wallpaper-3", title: "Ocean blue wallpaper", category: "wallpapers", photoId: "photo-1507525428034-b723cf961d3e" },
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

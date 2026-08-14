/**
 * Pure, dependency-free selection of the ordered, capped reference-image list
 * for image generation.
 *
 * Guarantees the "critical" brand visuals — the edit source, the logo, and the
 * product image — are never dropped by the provider image cap. Critical entries
 * are tracked by a stable boolean flag (not by object-reference comparisons such
 * as Array.includes on the final list), so protection is deterministic and the
 * cap only ever trims non-critical assets.
 *
 * Order (when present): editSource, logo, product, then remaining brand assets.
 * The first image remains the primary edit subject for providers that treat the
 * first reference specially.
 */

export interface ReferenceImage {
  mimeType: string;
  data: string;
}

export interface SelectReferenceImagesParams {
  editSource?: ReferenceImage | null;
  logo?: ReferenceImage | null;
  product?: ReferenceImage | null;
  otherBrandImages?: ReferenceImage[];
  cap?: number;
}

export function selectReferenceImages(
  params: SelectReferenceImagesParams,
): ReferenceImage[] {
  const cap = params.cap ?? 6;

  type Entry = { img: ReferenceImage; critical: boolean };
  const entries: Entry[] = [];

  if (params.editSource) {
    entries.push({ img: params.editSource, critical: true });
  }
  if (params.logo) {
    entries.push({ img: params.logo, critical: true });
  }
  if (params.product) {
    entries.push({ img: params.product, critical: true });
  }
  for (const img of params.otherBrandImages ?? []) {
    entries.push({ img, critical: false });
  }

  if (entries.length <= cap) {
    return entries.map((e) => e.img);
  }

  const critical = entries.filter((e) => e.critical);
  const nonCritical = entries.filter((e) => !e.critical);
  const kept = [
    ...critical,
    ...nonCritical.slice(0, Math.max(0, cap - critical.length)),
  ];
  return kept.map((e) => e.img);
}

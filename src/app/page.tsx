import { StorefrontExperience } from "@/components/storefront/storefront-experience";
import { createPublicCatalog } from "@/domain/catalog/public-catalog";
import { getCatalogSnapshot } from "@/server/catalog/file-catalog-repository";

export default async function Home() {
  const catalog = createPublicCatalog(await getCatalogSnapshot());
  return <StorefrontExperience catalog={catalog} />;
}

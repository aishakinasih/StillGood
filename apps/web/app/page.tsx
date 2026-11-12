import Script from "next/script";
import { marketplaceMarkup } from "./marketplace-markup";

/**
 * The source HTML is intentionally retained as-is from the previous Still Good UI.
 * Rendering it as a React-owned HTML fragment keeps its legacy CSS classes,
 * visual dimensions, copy, modal structure and inline interactions unchanged.
 */
export default function HomePage() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: marketplaceMarkup }} />
      <Script src="/assets/app.js?v=still-good-next-express-1" strategy="afterInteractive" />
    </>
  );
}

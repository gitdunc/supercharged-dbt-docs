/**
 * Branding Configuration
 * 
 * Customize the appearance and branding of the dbt documentation site.
 * You can override these values using environment variables.
 * 
 * Environment variables:
 * - NEXT_PUBLIC_ORG_NAME: Organization name (appears in logo)
 * - NEXT_PUBLIC_ORG_LOGO_URL: Custom logo URL (SVG or image)
 * - NEXT_PUBLIC_ORG_LINK: Organization link URL
 * - NEXT_PUBLIC_ORG_LOGO_HEIGHT: Logo height in pixels (default: 46)
 * 
 * If environment variables are not set, defaults to Featherweight Governance Tool branding.
 */

export interface BrandingConfig {
  orgName: string;
  logoUrl?: string;
  orgLink: string;
  logoHeight: number;
  logoWidth: number;
  useDefaultLogo: boolean;
  // Backward compatibility only.
  useDefaultDagsterLogo: boolean;
}

export function getBrandingConfig(): BrandingConfig {
  const orgName = process.env.NEXT_PUBLIC_ORG_NAME || "Featherweight Governance Tool";
  const orgLink = process.env.NEXT_PUBLIC_ORG_LINK || "https://featherweight.example";
  const logoUrl = process.env.NEXT_PUBLIC_ORG_LOGO_URL;
  const logoHeight = parseInt(process.env.NEXT_PUBLIC_ORG_LOGO_HEIGHT || "46", 10);
  const logoWidth = parseInt(process.env.NEXT_PUBLIC_ORG_LOGO_WIDTH || "168", 10);
  const useDefaultLogo = !logoUrl;
  const useDefaultDagsterLogo = useDefaultLogo;

  return {
    orgName,
    logoUrl,
    orgLink,
    logoHeight,
    logoWidth,
    useDefaultLogo,
    useDefaultDagsterLogo,
  };
}

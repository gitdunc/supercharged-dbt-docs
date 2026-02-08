import React from "react";
import Image from "next/image";
import { getBrandingConfig } from "../../config/branding";

export default function Logo() {
  const branding = getBrandingConfig();
  const orgName = branding.orgName || "Featherweight Governance Tool";
  const orgLink = branding.orgLink || "https://featherweight.example";
  const isDefaultFeatherBrand = orgName === "Featherweight Governance Tool";
  const shouldUseExternalLogo = Boolean(branding.logoUrl && !isDefaultFeatherBrand);
  const headline = isDefaultFeatherBrand ? "Featherweight" : orgName;
  const tagline = isDefaultFeatherBrand
    ? "Featherweight Governance Tool"
    : `Powered by ${orgName}`;

  return (
    <a
      href={orgLink}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "10px",
        textDecoration: "none",
        color: "#0b5cad",
      }}
      aria-label={`Powered by ${orgName}`}
      title={`Powered by ${orgName}`}
    >
      {shouldUseExternalLogo ? (
        <Image
          src={branding.logoUrl!}
          alt={`${orgName} logo`}
          width={branding.logoWidth}
          height={branding.logoHeight}
          unoptimized
          style={{
            height: `${branding.logoHeight}px`,
            width: "auto",
            maxWidth: `${branding.logoWidth}px`,
            objectFit: "contain",
          }}
        />
      ) : (
        <svg
          width="56"
          height="56"
          viewBox="0 0 64 64"
          data-logo-version="v3"
          role="img"
          aria-label={`${orgName} logo`}
        >
          <defs>
            <linearGradient id="fw-feather-main" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#2f7dd7" />
              <stop offset="100%" stopColor="#15395f" />
            </linearGradient>
            <linearGradient id="fw-binary" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f5a623" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#f5a623" stopOpacity="0.18" />
            </linearGradient>
          </defs>
          <g
            fill="url(#fw-binary)"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
            fontSize="6.9"
            fontWeight="700"
            opacity="0.86"
          >
            <text x="1.5" y="9.8">1011010</text>
            <text x="1.5" y="18.1">1110011</text>
            <text x="1.5" y="26.4">0101011</text>
            <text x="1.5" y="34.7">1010010</text>
            <text x="1.5" y="43">1011011</text>
            <text x="1.5" y="51.3">0110101</text>
          </g>
          <g transform="translate(2.2 1.8) scale(0.92)">
          <g transform="rotate(-24 32 32)">
            <path
              d="M8.2 43.8 C12.2 30.2 24.6 18.8 39.8 11.2 C48.2 7.0 58.3 7.8 60.0 14.2 C61.6 20.0 56.9 28.0 47.5 35.0 C34.9 44.6 20.5 51.8 9.6 49.4 Z"
              fill="url(#fw-feather-main)"
            />
            <path
              d="M9.4 48.2 C22.8 35.1 36.4 23.2 51.2 11.4"
              stroke="#f4f8ff"
              strokeWidth="2.75"
              strokeLinecap="round"
            />
            <path
              d="M14.4 42.9 C17.0 42.2 19.4 41.2 21.8 39.7 M17.8 39.1 C21.0 38.0 24.0 36.5 26.9 34.6 M21.5 35.1 C24.9 33.9 28.2 31.9 31.4 29.7 M25.4 31.0 C29.2 29.5 32.8 27.1 36.3 24.4 M29.6 26.8 C33.1 25.2 36.4 22.7 39.5 19.9 M33.8 22.3 C36.5 21.0 39.0 19.0 41.4 16.9"
              stroke="#f4f8ff"
              strokeWidth="1.85"
              strokeLinecap="round"
              opacity="0.95"
            />
            <path
              d="M15.5 44.0 C18.2 43.2 20.7 42.1 23.1 40.4 M19.1 40.1 C22.2 38.9 25.1 37.2 28.0 35.2 M22.8 36.2 C26.1 34.8 29.2 32.8 32.2 30.4 M26.8 32.1 C30.5 30.4 34.1 27.9 37.3 25.0 M31.0 27.9 C34.2 26.1 37.2 23.5 40.0 20.7"
              stroke="#ffffff"
              strokeWidth="1.1"
              strokeLinecap="round"
              opacity="0.9"
            />
            <path
              d="M8.6 50.5 C6.2 53.2 4.2 55.5 1.1 59.5 C4.0 58.8 7.2 57.8 10.5 56.1 C13.4 54.6 15.8 53.0 18.1 51.1 L12.9 49.6 Z"
              fill="url(#fw-feather-main)"
            />
            <path
              d="M7.9 56.8 C10.9 55.2 13.3 53.6 15.7 51.7"
              stroke="#f4f8ff"
              strokeWidth="1.25"
              strokeLinecap="round"
              opacity="0.9"
            />
          </g>
          </g>
        </svg>
      )}

      <span
        style={{
          display: "inline-flex",
          flexDirection: "column",
          lineHeight: 1.1,
        }}
      >
        <strong style={{ fontSize: "15px", letterSpacing: "0.2px" }}>{headline}</strong>
        <span style={{ fontSize: "11px", opacity: 0.85 }}>{tagline}</span>
      </span>
    </a>
  );
}

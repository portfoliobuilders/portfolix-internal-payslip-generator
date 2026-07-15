export const PAYROLL_CONTACT = "7994721792";

/**
 * Canonical legally registered name (exact spelling).
 * Documents must load this from company_identity / Settings — do not hardcode
 * alternate spellings like "Portfolix Enterprise Pvt Ltd" in PDF components.
 */
export const LEGAL_COMPANY_NAME_CANONICAL =
  "PORTFOLIX ENTREPRISE PRIVATE LIMITED";

export const COMPANY_ENTITIES = [
  {
    id: "portfolix-entreprise",
    displayName: "PORTFOLIX ENTREPRISE PRIVATE LIMITED",
    legalLine: "PORTFOLIX ENTREPRISE PRIVATE LIMITED",
    address: "1st Floor, Portfolix Hub,\n43/3906 B2, Puthiya Road,\nThammanam P.O., Kochi, Ernakulam,\nKerala – 682032, India.",
    logoPath: "/logos/portfolix-entreprise.png"
  },
  {
    id: "portfolix-tech",
    displayName: "Portfolix Tech",
    legalLine: "A unit of Portfolix Entreprise Pvt Ltd",
    address: "1st Floor, Portfolix Hub,\n43/3906 B2, Puthiya Road,\nThammanam P.O., Kochi, Ernakulam,\nKerala – 682032, India.",
    logoPath: "/logos/portfolix-tech.png"
  },
  {
    id: "portfolio-builders",
    displayName: "Portfolio Builders",
    legalLine: "A unit of Portfolix Entreprise Pvt Ltd",
    address: "1st Floor, Portfolix Hub,\n43/3906 B2, Puthiya Road,\nThammanam P.O., Kochi, Ernakulam,\nKerala – 682032, India.",
    logoPath: "/logos/portfolio-builders.png"
  },
  {
    id: "portfolix-hub",
    displayName: "Portfolix Hub",
    legalLine: "Portfolix Hub",
    address: "43/3906 B2, Puthiya Road,\nThammanam P.O., Kochi, Ernakulam,\nKerala – 682032, India.",
    logoPath: "/logos/portfolix-hub.png"
  }
] as const;

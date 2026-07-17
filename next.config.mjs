/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  experimental: {
    // Runtime PDF generation reads embedded font bytes on the Node server.
    outputFileTracingIncludes: {
      '/*': ['./node_modules/@fontsource/noto-sans-devanagari/files/*.woff'],
    },
  },
};

export default nextConfig;


/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  async redirects() {
    return [
      { source: '/EmployeeRoster', destination: '/employee-roster', permanent: false },
      { source: '/employeeroster', destination: '/employee-roster', permanent: false },
      { source: '/roster', destination: '/employee-roster', permanent: false },
      { source: '/Generator', destination: '/generator', permanent: false },
      { source: '/History', destination: '/history', permanent: false },
      { source: '/Settings', destination: '/settings', permanent: false },
    ];
  },
};

export default nextConfig;


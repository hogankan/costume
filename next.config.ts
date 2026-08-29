import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Vendor size-chart images are shown next to the transcribed table so the
    // numbers can be eye-checked against the source. They are served from the
    // vendors' own CDNs, so those hosts have to be allowed explicitly.
    remotePatterns: [
      { protocol: "https", hostname: "cdn11.bigcommerce.com" }, // Revolution
      { protocol: "https", hostname: "d2mf5zk7fvq4ou.cloudfront.net" }, // Weissman
      { protocol: "https", hostname: "i.shgcdn.com" }, // Revolution sizing pages
    ],
  },
};

export default nextConfig;

module.exports = {
    reactStrictMode: true,
    output: 'standalone',
    // Enable server-side rendering and API routes
    // Enables dynamic DAG computation at runtime instead of static pre-generation
    experimental: {
      serverActions: {
        allowedOrigins: ['localhost:3000', 'localhost:3001', '127.0.0.1'],
      },
    },
};

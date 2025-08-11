# Use nginx as base image
FROM nginx:alpine

# Copy the HTML files to nginx html directory
COPY index.html /usr/share/nginx/html/

# Copy a basic nginx configuration for this site
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

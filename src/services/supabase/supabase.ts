import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

// Track pending requests to limit concurrency
const pendingRequests = {
  count: 0,
  maxConcurrent: 2, // Maximum concurrent requests
  queue: [] as (() => void)[],
};

// Use a singleton pattern to ensure only one Supabase client instance is created
let supabaseInstance: ReturnType<typeof createClient> | null = null;
let supabaseAdminInstance: ReturnType<typeof createClient> | null = null;

// Regular client for normal operations
export const supabase = getSupabaseClient();

// Admin client for admin operations (like deleting users)
export const supabaseAdmin = getSupabaseAdminClient();

// Function to get or create the main Supabase client
function getSupabaseClient() {
  if (supabaseInstance) return supabaseInstance;

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      storageKey: "app-storage-key", // Unique storage key for the main client
    },
    realtime: {
      params: {
        eventsPerSecond: 10, // Increased from 1 to 10 to reduce latency
        fastlaneOnly: false, // Process all messages, not just fastlane
        realtimeTimeout: 2000, // Reduce timeout to detect connection issues faster
      },
    },
    global: {
      fetch: (...args) => {
        // Implement a custom fetch with retry logic for network errors
        return limitConcurrentRequests(() => customFetchWithRetry(...args));
      },
    },
  });

  return supabaseInstance;
}

// Function to get or create the admin Supabase client
function getSupabaseAdminClient() {
  if (supabaseAdminInstance) return supabaseAdminInstance;

  supabaseAdminInstance = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseAdminInstance;
}

// Function to limit concurrent requests
function limitConcurrentRequests<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const executeRequest = async () => {
      try {
        pendingRequests.count++;
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        pendingRequests.count--;

        // Process next request in queue if any
        if (pendingRequests.queue.length > 0) {
          const nextRequest = pendingRequests.queue.shift();
          if (nextRequest) nextRequest();
        }
      }
    };

    // If we're under the concurrent request limit, execute immediately
    if (pendingRequests.count < pendingRequests.maxConcurrent) {
      executeRequest();
    } else {
      // Otherwise, queue the request
      pendingRequests.queue.push(executeRequest);
    }
  });
}

// Store last successful request time for rate limiting
let lastRequestTime = 0;
const minRequestInterval = 1000; // Minimum time between requests in ms

// Custom fetch implementation with retry logic
async function customFetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  retries = 3,
  backoff = 1000
): Promise<Response> {
  // Check if we need to rate limit
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < minRequestInterval) {
    // Wait for the remaining time to ensure minimum interval between requests
    await new Promise((resolve) =>
      setTimeout(resolve, minRequestInterval - timeSinceLastRequest)
    );
  }

  try {
    // Update last request time
    lastRequestTime = Date.now();

    const response = await fetch(input, init);
    // If the request was successful, return the response
    return response;
  } catch (err) {
    console.log("Request failed:", err);

    // Handle insufficient resources error
    const isResourceError =
      err instanceof Error &&
      (err.message.includes("ERR_INSUFFICIENT_RESOURCES") ||
        err.message.includes("Failed to fetch"));

    // If we have no retries left, or this isn't a resource error, throw
    if (retries <= 0 || !isResourceError) {
      throw err;
    }

    console.log(`Retrying request after ${backoff}ms, ${retries} retries left`);

    // Wait for the backoff period
    await new Promise((resolve) => setTimeout(resolve, backoff));

    // Retry with one fewer retry and 2x the backoff
    return customFetchWithRetry(input, init, retries - 1, backoff * 2);
  }
}

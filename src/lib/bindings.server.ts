import { env } from "cloudflare:workers";
import type {
  D1Database,
  DurableObjectNamespace,
  KVNamespace,
  R2Bucket,
} from "@cloudflare/workers-types";

type AppEnv = {
  DB?: D1Database;
  STORAGE?: R2Bucket;
  KV?: KVNamespace;
  CONTAINER?: DurableObjectNamespace;
  HF_ENV?: string;
  APP_SLUG?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
};

export function bindings(): AppEnv {
  return env as unknown as AppEnv;
}

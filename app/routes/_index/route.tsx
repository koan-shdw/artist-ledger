import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
export async function loader({request}:LoaderFunctionArgs){const url=new URL(request.url);if(url.searchParams.get("shop"))throw redirect(`/app?${url.searchParams.toString()}`);return {showForm:!!login}}
export default function Index(){const {showForm}=useLoaderData<typeof loader>();return <main style={{maxWidth:500,margin:"12vh auto",padding:30,fontFamily:"Arial,sans-serif",lineHeight:1.6}}><h1>Artist Ledger</h1><p>Monthly artist sales statements, product costs, and gallery splits.</p>{showForm&&<Form method="post" action="/auth/login"><label htmlFor="shop">Shopify store domain</label><input id="shop" name="shop" required placeholder="your-store.myshopify.com" style={{display:"block",width:"100%",padding:12,margin:"12px 0"}}/><button style={{padding:"12px 20px"}}>Open in Shopify</button></Form>}</main>}

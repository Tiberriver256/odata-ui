# Goals, thoughts, and inspirations

odata-ui is a swagger-ui-style explorer for OData itself. An OData service is closer to a database you can query than to a list of HTTP operations, and the UI should know the model.

## Goals

Someone who already drops swagger-ui into an ASP.NET Core app should be able to drop this in the same way and point it at a service root:

```js
ODataUI({
  url: "https://services.odata.org/TripPinRESTierService",
  dom_id: "explorer",
});
```

From that one call, the explorer should:

- Read `$metadata` and show the service as a tree: entity sets, singletons, entity and complex types, enums, functions, and actions.
- Open a type and show its key, properties, navigation, inheritance, and annotations.
- Draw entity types and navigation properties as a relationship diagram.
- Build a query by pointing and clicking — `$filter`, `$select`, nested `$expand`, `$orderby`, `$top`, `$skip`, `$count`, `$search`, and a modest `$apply` — with the URL visible and updating as the query changes.
- Run the query and show a grid that pages and expands nested data, with the raw JSON beside it.

The core is plain TypeScript and CSS, with no framework inside it. React, Vue, Angular, and Svelte are thin wrappers around the same `mount`. React and one other wrapper are the real first pair; the other two can be explicit stubs until someone needs them. npm publishing waits. Commit messages stay [conventional](https://www.conventionalcommits.org/) so release-please can be added later, the way it is on [Swashbuckle.AspNetCore.Community.OData](https://github.com/Tiberriver256/Swashbuckle.AspNetCore.Community.OData).

ASP.NET Core hosting comes after the bundle exists: a static file plus a middleware that points the explorer at the app's own `/$metadata`. That package is what makes the drop-in feel like `UseSwaggerUI`. It is a later package, and the standalone `ODataUI({ url, dom_id })` function is the seam it needs.

The demo that proves the first version is the public TripPin RESTier service. Browse its metadata, build a filtered and expanded query, and show the rows.

## Inspirations

### XOData

[XOData](https://pragmatiqa.com/xodata/) (PragmatiQa) is the tool that already treats an OData service as something you look at. Three surfaces do most of the work:

- An interactive relationship diagram, filterable down to one entity and its neighbors. Metadata XML can be loaded from a URL or from a file, so the picture works when the service itself is unreachable.
- A details view for entities, types, properties, and functions.
- A query builder that rebuilds itself from the current `$metadata`. Expand can carry a nested `$select`. The generated URL stays editable for the cases the checkboxes do not cover. Results render in a table, and related rows can be followed from a result or pulled in with `$expand`.

The online tool is for public services. The Chrome app adds basic auth and localhost. Around that core, XOData also charts, pivots, maps, exports CSV, and flattens 1:1 expands into a spreadsheet. Those are a later product. The part worth taking first is the trio of diagram, details, and a builder that cannot drift away from the model.

XOData's own notes are specific about its gaps, and they are useful constraints. Queries default to `and` (with `in` as a stand-in for some `or` cases) and rely on hand-editing past that. Bound functions are weak in the builder. Deep expand showed up for v3 before it showed up for v4. A new explorer can do better on `or`, nested expand, and bound operations, and it can still offer a raw URL box for everything else.

### swagger-ui, and the OpenAPI projection of OData

swagger-ui is the distribution model. `SwaggerUIBundle({ url, dom_id })` is the right gesture: a script, a node, a document URL. People already know it, and an ASP.NET Core app already knows how to serve it.

The document it renders is the wrong shape for exploring OData. OpenAPI lists operations. The interesting OData surface is one entity set plus a query language. [Swashbuckle.AspNetCore.Community.OData](https://github.com/Tiberriver256/Swashbuckle.AspNetCore.Community.OData) already does the translation well: real endpoint paths, and `$filter`, `$select`, `$expand`, `$orderby`, `$top`, `$skip`, `$count`, `$search` documented as parameters. swagger-ui still presents those parameters as strings you type by hand.

odata-ui sits beside that document. The OpenAPI UI stays the catalog of operations. This one is the model, the relationships, and a query you can see being built. Hosting it should eventually feel like the middleware in that Swashbuckle package, pointed at `$metadata` instead of `swagger.json`.

### The public samples

The samples are the third inspiration, because they are the documents a parser has to survive.

- [TripPin RESTier](https://services.odata.org/TripPinRESTierService) is the demo target. It has inheritance (`Employee` and `Manager` over `Person`, `Flight` over `PublicTransportation` over `PlanItem`), complex types, enums, bound and unbound functions, actions, and a `Me` singleton.
- [TripPin V4 RW](https://services.odata.org/V4/TripPinServiceRW) is the right second preset. It adds capabilities annotations, containment (`ContainsTarget`), a media stream on `Photo`, and a function import that shows up in the service document.
- [The V3 sample](https://services.odata.org/V3/OData/OData.svc/$metadata) is still associations, roles, and multiplicity. That is the old navigation model, and plenty of services still publish it. XOData's value was partly that one tool opened the service you actually had.

## Thoughts

### One model, several documents

Keep a single in-memory model: schemas, entity and complex types, enums, navigation properties, containers, entity sets, singletons, functions, actions, imports, and annotations. An annotation is a term plus a JSON-ish value. `Org.OData.Core.V1.Computed` and `OptimisticConcurrency` should be visible on the property or the set. They do not need a typed class per vocabulary term.

Inheritance is stored as a base name and walked when the UI asks for "all properties," so `Employee` still shows `UserName`. Derived types are how the diagram draws a hierarchy without copying properties onto every subtype.

v4 XML CSDL is the parser that matters for TripPin and for ASP.NET Core OData. JSON CSDL is the same model with `$Kind`, `$Type`, `$Collection`, and `self.` — a second front end, not a second model. v2/v3 should be translated on the way in: resolve each `NavigationProperty`'s `Relationship` and `ToRole` through `Association` ends, and emit an ordinary navigation property whose type is a collection when the multiplicity is `*`. The rest of the tool then sees one shape. Detect the document from its first character and from the `edmx` version / `DataServiceVersion`. External `$Reference` includes can wait; a warning is more honest than a silent empty schema.

### The query is data

The builder lives in the core as a tree, and the UI compiles a draft into it.

- `$filter` is an expression: comparisons, `contains` / `startswith` / `endswith`, `and` / `or` / `not`, `any` / `all`, `in`, and literals for strings, numbers, bools, null, enums (`Trippin.PersonGender'Male'`), guids, dates, and durations.
- `$expand` is recursive. Each node can carry `$select`, nested `$expand`, `$filter`, `$orderby`, `$top`, `$skip`, `$count`, and `$levels`. Options inside the parentheses are separated with `;`.
- `$apply` starts small: `filter`, `groupby`, and `aggregate` (`sum`, `min`, `max`, `average`, `countdistinct`, `$count`). When a group-by is set, the filter moves inside `$apply` as the first transformation.

Print two strings from that tree. One is the readable URL on the page. The other is the encoded href passed to `fetch`. Mixed `and` / `or` gets parentheses. String literals double embedded quotes. The page keeps the URL editable, for the same reason XOData does: the builder will always be a subset of the language.

The UI draft is rows, not text. A filter row is a property path (including one or two steps into a complex type, such as `HomeAddress/City/Name`), an operator, and a value. Enum properties become a member picker. `Collection(Edm.String)` gets a "contains" row that prints `Emails/any(e: e eq '…')`. Expand is a checklist of navigation properties, each of which can open its own select and its own children. `$select` empty means "all." Top, skip, count, search, and order-by sit next to that.

### The client is mostly a session and a JSON envelope

`GET {serviceRoot}/$metadata`, follow redirects, parse the body, then set the service root from the final URL with `/$metadata` removed. This is not a theoretical concern. TripPin answers `302` to a path containing `(S(session))`, and a later request that ignores that prefix opens a different session. Adopting `response.url` after the metadata fetch keeps the demo's queries on the same sample database the metadata described. `services.odata.org` sends `Access-Control-Allow-Origin: *`, so a local demo can call it directly.

Data requests ask for `application/json;odata.metadata=minimal`. The result reader understands a `value` array, a single entity, `@odata.count`, `@odata.nextLink`, and `error.message`. Headers are a pass-through so a future host can attach a bearer token. Paging follows `nextLink` as an absolute URL. Actions such as `ResetDataSource` stay visible as signatures; invoking one is an explicit POST, because that particular action wipes the sample.

### The screen

Vanilla DOM and one stylesheet, themed with CSS variables so a host can recolor the explorer without forking it. A single `mount(element, options)` owns the root. Shadow DOM keeps the CSS inside the bundle, and custom properties still inherit. The standalone build injects that stylesheet and assigns `globalThis.ODataUI`, so one script tag is the whole integration. The library global should be the function itself. An IIFE named `ODataUI` that returns `{ default: fn }` would miss the swagger-ui shape people will type.

Layout: a tree on the left, and the three XOData surfaces on the right — details, diagram, query. The URL stays on screen while the grid and the raw JSON sit under the builder. The tree groups entity sets, singletons, operations, entity types, complex types, and enums, with a name filter. Selecting a set opens its details, then the query, already aimed at that set. A key field prints `People('russellwhyte')` or `Trips(1)` from the key's EDM type.

The diagram is entity cards and edges, laid out in the browser. Navigation is one kind of line, inheritance another, with the property name and a `1` or `*` on the edge. Clicking a card selects that type. TripPin is about ten entity types, so a simple force layout is enough. XOData's claim of hundreds of entities is the reason the diagram has a filter on day one: the picture of "everything" is only useful if you can focus it on one type and its neighbors.

Results prefer structural columns, then any expanded navigation present in the payload. Nested objects and collections expand in place. `@odata.*` stays out of the grid and remains visible in the JSON view. Nulls are an em dash, numbers line up, and the next page is the next link rather than a second guess at `$skip`.

Framework wrappers only call `mount` and disconnect on unmount. They import the same CSS. Angular and Svelte can ship as a short note and a sketch of the component, so the repo does not imply they run.

### What the first version is for

The audience is the person who already lives in swagger-ui and maintains an OData service. They want to see the model, see how types connect, and try a query without hand-writing `$expand`. Charts, pivot tables, CSV export, batch, a full `$compute` language, and a polished invoker for every bound function can follow. XOData already showed that cluster is its own product.

Tests belong on the parser and the URL printer, against saved copies of the TripPin and V3 metadata. Those two pieces rot quietly if they are only checked by eye. CI is lint, typecheck, those tests, and the bundle build. The demo is a Vite app with TripPin RESTier as the default preset and TripPin V4 beside it.

import { loadProject, project } from "@/app/projectService";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import _ from "lodash";

export default async function OverviewPage({ id }: { id?: string }) {
  await loadProject();

  const docs = project.docs || {};
  let selected_overview = docs["doc.dbt.__overview__"];
  const overviews = _.filter(docs, { name: "__overview__" });
  _.each(overviews, function (overview) {
    if (overview.package_name != "dbt") {
      selected_overview = overview;
    }
  });

  if (id != null) {
    selected_overview =
      docs[`doc.${id}.__${id}__`] || selected_overview;
    const overviews = _.filter(docs, { name: `__${id}__` });
    _.each(overviews, (overview) => {
      if (overview.package_name !== id) {
        selected_overview = overview;
      }
    });
  }
  const overview_md =
    selected_overview?.block_contents ||
    `# Overview\n\nNo overview documentation was found for this project.`;
  return (
    <div className="app-details app-scroll app-pad">
      <div className="app-frame app-pad">
        <div className="panel panel-default">
          <div className="panel-body">
            <div>
              <MarkdownBlock markdown={overview_md} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

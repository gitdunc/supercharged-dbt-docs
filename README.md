This is a rewrite of [dbt docs](https://github.com/dbt-labs/dbt-docs) using [Next.js](https://nextjs.org/) with React Server Components and SSG.

This project was originally built primarily by Marco Salazar with contributions by Pete Hunt. It is built on top of the [dbt-docs](https://github.com/dbt-labs/dbt-docs) project.

Want to try this on your own project?
* Install Node.js and Yarn (https://nodejs.org/)
* Replace `catalog.json` and `manifest.json` with the equivalent files from your dbt project
* Run `yarn && yarn build`
* Your docs will be generated in the `dist/supercharged` folder.
* To test locally, run `npm run dev` NB: This is like running `dbt docs server`
* Open browser at location: `http://localhost:3000`



Supercharged version: http://dbt-docs-supercharged-demo.s3-website-us-west-1.amazonaws.com/supercharged/


Original DBT Version: http://dbt-docs-supercharged-demo.s3-website-us-west-1.amazonaws.com/original-dbt-docs-sources/#!/overview

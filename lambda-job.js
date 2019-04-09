var AWS = require('aws-sdk');
var cw = new AWS.CloudWatch({ region: 'us-west-2'});

exports.handler = function (event, context) {

    var EndTime = new Date;
    
    // getting last 5 minutes
    var StartTime = new Date(EndTime - 5 * 60 * 1000);
    var bulkData = {body: []};
    var listParams = {
        MetricName: 'MetricName',
        Namespace: 'namespace/namespace', // like aws/ec2
        NextToken: null
    };


    function getListOfMetrics(parameters) {
         cw.listMetrics(parameters, function(err,data) {
            if (err) {
                console.log(err, err.stack, ' cw error');
            }
            else {
                //once we get a list, get the metric output for the list items
                getMetricStatistics(data.Metrics);
                
                // if there is a next token, get the next set of data
                if (data.NextToken) {
                    parameters.NextToken = data.NextToken;
                    getListOfMetrics(parameters);
                } else {  // last chunk
                }
            }
        });
    }



    function getMetricStatistics (metrics) {
        for (let i in metrics) {

            let params = {
                MetricName: metrics[i].MetricName,
                Namespace: metrics[i].Namespace,
                Dimensions: metrics[i].Dimensions,
                Period: 60,
                StartTime: StartTime,
                EndTime: EndTime,
                Statistics: ['Average']
            };

            cw.getMetricStatistics(params, function (err, data) {
                if (err) {
                    console.log(err, err.stack, 'get metric statistics');
                } else {

                    data.Datapoints.forEach(function (datapoint) {
                        // clear the data then map what you need to the datapoint object
                        bulkData.body = [];
                        datapoint.type = '_source';
                        datapoint.Namespace = 'namespace/namespace';
                        datapoint.MetricName = 'specificMetrictoFetch';
                        datapoint.Role = params.Dimensions[0].Value;
                        datapoint.Platform = params.Dimensions[2].Value;
                        datapoint.SpecialName = params.Dimensions[1].Value;
                        datapoint.Host = params.Dimensions[3].Value;
                        datapoint.Region = params.Dimensions[4].Value;

                        // push data
                        bulkData.body.push(datapoint);

                        sendToElasticSearch(bulkData);
                    });
                }
            });
        }



    }

    function  sendToElasticSearch (bulkData) {
        if (bulkData.body.length > 0) {

            var domain = 'elasticsearchEndpoint';  // should end in us-west-2.es.amazonaws.com something like this
            var index = 'healthcheck';
            var type = 'typeOfData';

            var endpoint = new AWS.Endpoint(domain);
            var request = new AWS.HttpRequest(endpoint, 'us-west-2');


            request.method = 'POST';
            request.path +=  index + '/' + type;
            request.body = JSON.stringify(bulkData.body[0]);
            request.headers['host'] = domain;
            request.headers['Content-Type'] = 'application/json';

            var credentials = new AWS.EnvironmentCredentials('AWS');
            var signer = new AWS.Signers.V4(request, 'es');
            signer.addAuthorization(credentials, new Date());

            let client = new AWS.HttpClient();
            client.handleRequest(request, null, function(response) {
                console.log(response.statusCode + ' ' + response.statusMessage);
                var responseBody = '';
                response.on('data', function (chunk) {
                    responseBody += chunk;
                });
                response.on('end', function (chunk) {
                    console.log('Response body: ' + responseBody);
                });
            }, function(error) {
                console.log('Error: ' + error);
            });
        }

    }


    getListOfMetrics(listParams);
}
